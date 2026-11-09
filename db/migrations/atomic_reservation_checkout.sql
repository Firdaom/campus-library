CREATE OR REPLACE FUNCTION public.checkout_reservation_atomic(
  p_reservation_id uuid,
  p_user_id uuid,
  p_due_at timestamptz,
  p_max_active_loans integer
)
RETURNS TABLE (
  id uuid,
  copy_id uuid,
  user_id uuid,
  due_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_user_status public.user_status;
  v_eligibility public.eligibility_status;
  v_reservation_user_id uuid;
  v_resource_id uuid;
  v_reservation_status public.reservation_status;
  v_expires_at timestamptz;
  v_copy_id uuid;
  v_copy_resource_id uuid;
  v_copy_status public.copy_status;
  v_has_next_queue boolean;
  v_active_count integer;
  v_loan_id uuid;
  v_due_at timestamptz;
BEGIN
  -- Validate arguments.
  IF p_reservation_id IS NULL
     OR p_user_id IS NULL
     OR p_due_at IS NULL
     OR p_max_active_loans IS NULL
     OR p_max_active_loans < 1 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS'
      USING ERRCODE = '22023';
  END IF;

  -- Read the resource ID first (without locking).
  -- This allows us to acquire the resource-level lock first.
  SELECT r.resource_id
  INTO v_resource_id
  FROM public.reservations r
  WHERE r.id = p_reservation_id;

  IF NOT FOUND OR v_resource_id IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the resource before locking reservation or copy rows.
  PERFORM 1
  FROM public.resources res
  WHERE res.id = v_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock borrower and verify account status.
  SELECT u.status, u.eligibility_status
  INTO v_user_status, v_eligibility
  FROM public.users u
  WHERE u.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_user_status IS DISTINCT FROM 'active'::public.user_status THEN
    RAISE EXCEPTION 'STUDENT_INACTIVE'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_eligibility IS DISTINCT FROM 'eligible'::public.eligibility_status THEN
    RAISE EXCEPTION 'STUDENT_INELIGIBLE'
      USING ERRCODE = 'P0001';
  END IF;
  
    -- Prevent a student from having multiple active loans
  -- for the same resource, even when the physical copies differ.
  IF EXISTS (
    SELECT 1
    FROM public.loans l
    JOIN public.copies c ON c.id = l.copy_id
    WHERE l.user_id = p_user_id
      AND c.resource_id = v_resource_id
      AND l.returned_at IS NULL
      AND l.status = 'active'::public.loan_status
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_RESOURCE_LOAN'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock reservation and re-check its current state.
  SELECT
    r.user_id,
    r.resource_id,
    r.status,
    r.expires_at,
    r.held_copy_id
  INTO
    v_reservation_user_id,
    v_resource_id,
    v_reservation_status,
    v_expires_at,
    v_copy_id
  FROM public.reservations r
  WHERE r.id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation_user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'RESERVATION_USER_MISMATCH'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation_status IS DISTINCT FROM 'ready'::public.reservation_status THEN
    RAISE EXCEPTION 'RESERVATION_NOT_READY'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_copy_id IS NULL THEN
    RAISE EXCEPTION 'RESERVATION_COPY_MISSING'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the held copy and verify that it belongs to this resource.
  SELECT c.resource_id, c.status
  INTO v_copy_resource_id, v_copy_status
  FROM public.copies c
  WHERE c.id = v_copy_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_copy_resource_id IS DISTINCT FROM v_resource_id
     OR v_copy_status IS DISTINCT FROM 'held'::public.copy_status THEN
    RAISE EXCEPTION 'COPY_NOT_HELD'
      USING ERRCODE = 'P0001';
  END IF;

  -- If the reservation has expired, check whether another user is waiting.
  IF v_expires_at IS NOT NULL AND v_expires_at <= now() THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.reservations r
      WHERE r.resource_id = v_resource_id
        AND r.status = 'pending'::public.reservation_status
    )
    INTO v_has_next_queue;

    IF v_has_next_queue THEN
      RAISE EXCEPTION 'RESERVATION_EXPIRED_HAS_QUEUE'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Enforce the active-loan limit.
  SELECT COUNT(*)::integer
  INTO v_active_count
  FROM public.loans l
  WHERE l.user_id = p_user_id
    AND l.returned_at IS NULL
    AND l.status = 'active'::public.loan_status;

  IF v_active_count >= p_max_active_loans THEN
    RAISE EXCEPTION 'MAX_ACTIVE_LOANS_REACHED'
      USING ERRCODE = 'P0001';
  END IF;

  -- Create the loan.
  INSERT INTO public.loans (
    copy_id,
    user_id,
    borrowed_at,
    due_at,
    status
  )
  VALUES (
    v_copy_id,
    p_user_id,
    now(),
    p_due_at,
    'active'::public.loan_status
  )
  RETURNING loans.id, loans.due_at
  INTO v_loan_id, v_due_at;

  -- Mark the copy as loaned.
   UPDATE public.copies AS c
  SET
    status = 'loaned'::public.copy_status,
    updated_at = now()
  WHERE c.id = v_copy_id
    AND c.status = 'held'::public.copy_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COPY_NOT_HELD'
      USING ERRCODE = 'P0001';
  END IF;

  -- Complete the reservation.
   UPDATE public.reservations AS r
  SET status = 'fulfilled'::public.reservation_status
  WHERE r.id = p_reservation_id
    AND r.status = 'ready'::public.reservation_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_READY'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT v_loan_id, v_copy_id, p_user_id, v_due_at;
END;
$$;

-- Only the backend service role may call this RPC.
REVOKE ALL ON FUNCTION public.checkout_reservation_atomic(
  uuid, uuid, timestamptz, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.checkout_reservation_atomic(
  uuid, uuid, timestamptz, integer
) TO service_role;