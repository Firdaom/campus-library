
-- ============================================================================
-- Campus Library — Atomic Reservation Creation RPC
-- Locks the resource, validates active user, checks availability,
-- and creates a pending reservation.
-- Eligibility is checked at checkout/borrow, NOT at reservation creation.
-- Only the backend service_role can execute this function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_reservation_atomic(
  p_resource_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  resource_id uuid,
  user_id uuid,
  status public.reservation_status,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_available_count integer;
  v_reservation_id uuid;
  v_created_at timestamptz;
  v_user_status text;
BEGIN
  -- Validate arguments.
  IF p_resource_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS'
      USING ERRCODE = '22023';
  END IF;

  -- Lock resource first to serialize queue operations.
  PERFORM 1
  FROM public.resources r
  WHERE r.id = p_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock and validate user after acquiring the resource lock.
  SELECT u.status::text
  INTO v_user_status
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_user_status <> 'active' THEN
    RAISE EXCEPTION 'USER_NOT_ACTIVE'
      USING ERRCODE = 'P0001';
  END IF;
    -- Prevent a student from reserving a resource
  -- that they already have an active loan for.
  IF EXISTS (
    SELECT 1
    FROM public.loans l
    JOIN public.copies c ON c.id = l.copy_id
    WHERE l.user_id = p_user_id
      AND c.resource_id = p_resource_id
      AND l.returned_at IS NULL
      AND l.status = 'active'::public.loan_status
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_RESOURCE_LOAN'
      USING ERRCODE = 'P0001';
  END IF;

  -- Intentionally do NOT check eligibility_status here.
  -- Eligibility is required at checkout/borrow.

  -- Check available copies while holding the resource lock.
  SELECT COUNT(*)::integer
  INTO v_available_count
  FROM public.copies c
  WHERE c.resource_id = p_resource_id
    AND c.status = 'available'::public.copy_status;

  IF v_available_count > 0 THEN
    RAISE EXCEPTION 'COPY_AVAILABLE'
      USING ERRCODE = 'P0001';
  END IF;

  -- Create the reservation in the FIFO queue.
  INSERT INTO public.reservations (
    resource_id,
    user_id,
    status
  )
  VALUES (
    p_resource_id,
    p_user_id,
    'pending'::public.reservation_status
  )
  RETURNING reservations.id, reservations.created_at
  INTO v_reservation_id, v_created_at;

  RETURN QUERY
  SELECT
    v_reservation_id,
    p_resource_id,
    p_user_id,
    'pending'::public.reservation_status,
    v_created_at;
END;
$$;

-- Only the backend service role may call this RPC.
REVOKE ALL ON FUNCTION public.create_reservation_atomic(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_reservation_atomic(uuid, uuid)
TO service_role;
