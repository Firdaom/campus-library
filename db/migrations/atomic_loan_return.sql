
-- ============================================================================
-- Campus Library — Atomic Loan Return RPC
-- Returns a loan and promotes the next FIFO reservation atomically.
-- Uses the resource row as the shared queue lock.
-- Reservation hold period: 48 hours.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.return_loan_atomic(
  p_loan_id uuid
)
RETURNS TABLE (
  loan_id uuid,
  returned_at timestamptz,
  copy_id uuid,
  resource_id uuid,
  promoted_reservation_id uuid,
  promoted_user_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_copy_id uuid;
  v_resource_id uuid;
  v_returned_at timestamptz;
  v_reservation_id uuid;
  v_user_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF p_loan_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS'
      USING ERRCODE = '22023';
  END IF;

  -- Find the resource associated with this loan.
  SELECT l.copy_id, c.resource_id
  INTO v_copy_id, v_resource_id
  FROM public.loans l
  JOIN public.copies c ON c.id = l.copy_id
  WHERE l.id = p_loan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOAN_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the resource first.
  -- All queue-mutating operations must use this same lock.
  PERFORM 1
  FROM public.resources r
  WHERE r.id = v_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock and validate the loan and copy.
  PERFORM 1
  FROM public.loans l
  JOIN public.copies c ON c.id = l.copy_id
  WHERE l.id = p_loan_id
    AND l.copy_id = v_copy_id
    AND c.resource_id = v_resource_id
    AND l.returned_at IS NULL
    AND l.status = 'active'::public.loan_status
    AND c.status = 'loaned'::public.copy_status
  FOR UPDATE OF l, c;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOAN_ALREADY_RETURNED_OR_COPY_INVALID'
      USING ERRCODE = 'P0001';
  END IF;

  -- Mark the loan as returned.
  UPDATE public.loans l
  SET returned_at = now()
  WHERE l.id = p_loan_id
    AND l.returned_at IS NULL
  RETURNING l.returned_at INTO v_returned_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LOAN_ALREADY_RETURNED'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock the earliest pending reservation (FIFO).
  SELECT r.id, r.user_id
  INTO v_reservation_id, v_user_id
  FROM public.reservations r
  WHERE r.resource_id = v_resource_id
    AND r.status = 'pending'::public.reservation_status
  ORDER BY r.created_at ASC, r.id ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    -- Hold the copy for the next student for 48 hours.
    v_expires_at := now() + interval '48 hours';

    UPDATE public.reservations r
    SET
      status = 'ready'::public.reservation_status,
      ready_at = now(),
      expires_at = v_expires_at,
      held_copy_id = v_copy_id
    WHERE r.id = v_reservation_id
      AND r.status = 'pending'::public.reservation_status;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RESERVATION_PROMOTION_FAILED'
        USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.copies c
    SET status = 'held'::public.copy_status
    WHERE c.id = v_copy_id
      AND c.status = 'loaned'::public.copy_status;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'COPY_UPDATE_FAILED'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    -- No waiting reservation: make the copy available.
    UPDATE public.copies c
    SET status = 'available'::public.copy_status
    WHERE c.id = v_copy_id
      AND c.status = 'loaned'::public.copy_status;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'COPY_UPDATE_FAILED'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p_loan_id,
    v_returned_at,
    v_copy_id,
    v_resource_id,
    v_reservation_id,
    v_user_id,
    v_expires_at;
END;
$$;

-- Only the backend service role may call this RPC.
REVOKE ALL ON FUNCTION public.return_loan_atomic(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.return_loan_atomic(uuid)
TO service_role;
