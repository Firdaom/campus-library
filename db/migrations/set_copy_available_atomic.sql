-- Atomically release a copy back to available.
-- Staff cannot manually set a copy to held.
-- Resource lock coordinates this operation with reservation workflows.

CREATE OR REPLACE FUNCTION public.set_copy_available_atomic(
  p_copy_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_resource_id uuid;
  v_copy_id uuid;
  v_status text;
  v_active_loan_exists boolean;
  v_ready_reservation_exists boolean;
BEGIN
  IF p_copy_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS';
  END IF;

  -- 1. Read the resource ID before acquiring locks.
  SELECT resource_id
  INTO v_resource_id
  FROM public.copies
  WHERE id = p_copy_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COPY_NOT_FOUND';
  END IF;

  -- 2. Lock the resource first.
  PERFORM 1
  FROM public.resources
  WHERE id = v_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND';
  END IF;

  -- 3. Lock and recheck the copy.
  SELECT id, status::text
  INTO v_copy_id, v_status
  FROM public.copies
  WHERE id = p_copy_id
    AND resource_id = v_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COPY_NOT_FOUND';
  END IF;

  -- 4. Do not release a copy that still has an active loan.
  SELECT EXISTS (
    SELECT 1
    FROM public.loans
    WHERE copy_id = v_copy_id
      AND returned_at IS NULL
  )
  INTO v_active_loan_exists;

  IF v_active_loan_exists THEN
    RAISE EXCEPTION 'COPY_HAS_ACTIVE_LOAN';
  END IF;

  -- 5. Do not release a copy assigned to a ready reservation.
  SELECT EXISTS (
    SELECT 1
    FROM public.reservations
    WHERE held_copy_id = v_copy_id
      AND status = 'ready'
  )
  INTO v_ready_reservation_exists;

  IF v_ready_reservation_exists THEN
    RAISE EXCEPTION 'COPY_HAS_READY_RESERVATION';
  END IF;

  -- 6. Release the copy.
  UPDATE public.copies
  SET status = 'available'
  WHERE id = v_copy_id
  RETURNING status::text INTO v_status;

  RETURN jsonb_build_object(
    'id', v_copy_id,
    'resource_id', v_resource_id,
    'status', v_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_copy_available_atomic(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_copy_available_atomic(uuid)
TO service_role;