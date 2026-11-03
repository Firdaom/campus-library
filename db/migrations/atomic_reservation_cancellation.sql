
-- ============================================================================
-- Campus Library — Atomic Reservation Cancellation
-- Allows a user to cancel their own pending or ready reservation.
-- If ready, releases the held copy to the next FIFO reservation.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_reservation_atomic(
  p_reservation_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  reservation_id uuid,
  cancelled_status public.reservation_status,
  resource_id uuid,
  released_copy_id uuid,
  promoted_reservation_id uuid,
  promoted_user_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_resource_id uuid;
  v_copy_id uuid;
  v_status public.reservation_status;
  v_promoted_reservation_id uuid;
  v_promoted_user_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF p_reservation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS'
      USING ERRCODE = '22023';
  END IF;

  -- Read the reservation to identify its resource.
  SELECT r.resource_id
  INTO v_resource_id
  FROM public.reservations r
  WHERE r.id = p_reservation_id
    AND r.user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND_OR_NOT_OWNER'
      USING ERRCODE = 'P0001';
  END IF;

  -- Shared lock for all queue-changing operations.
  PERFORM 1
  FROM public.resources r
  WHERE r.id = v_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock and re-check the reservation after acquiring the resource lock.
  SELECT r.status, r.held_copy_id
  INTO v_status, v_copy_id
  FROM public.reservations r
  WHERE r.id = p_reservation_id
    AND r.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND_OR_NOT_OWNER'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status NOT IN (
    'pending'::public.reservation_status,
    'ready'::public.reservation_status
  ) THEN
    RAISE EXCEPTION 'RESERVATION_NOT_CANCELLABLE'
      USING ERRCODE = 'P0001';
  END IF;

  -- A ready reservation must have a valid held copy.
  IF v_status = 'ready'::public.reservation_status THEN
    IF v_copy_id IS NULL THEN
      RAISE EXCEPTION 'HELD_COPY_INVALID'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM 1
    FROM public.copies c
    WHERE c.id = v_copy_id
      AND c.resource_id = v_resource_id
      AND c.status = 'held'::public.copy_status
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'HELD_COPY_INVALID'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Cancel the reservation.
  UPDATE public.reservations r
  SET status = 'cancelled'::public.reservation_status
  WHERE r.id = p_reservation_id
    AND r.user_id = p_user_id
    AND r.status = v_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_CANCELLATION_FAILED'
      USING ERRCODE = 'P0001';
  END IF;

  -- Pending cancellation does not release a copy.
  IF v_status = 'ready'::public.reservation_status THEN
    -- Find the next pending reservation in FIFO order.
    SELECT r.id, r.user_id
    INTO v_promoted_reservation_id, v_promoted_user_id
    FROM public.reservations r
    WHERE r.resource_id = v_resource_id
      AND r.status = 'pending'::public.reservation_status
    ORDER BY r.created_at ASC, r.id ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      v_expires_at := now() + interval '48 hours';

      UPDATE public.reservations r
      SET
        status = 'ready'::public.reservation_status,
        ready_at = now(),
        expires_at = v_expires_at,
        held_copy_id = v_copy_id
      WHERE r.id = v_promoted_reservation_id
        AND r.status = 'pending'::public.reservation_status;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'RESERVATION_PROMOTION_FAILED'
          USING ERRCODE = 'P0001';
      END IF;

      -- The copy remains held, now for the next student.
      UPDATE public.copies c
      SET status = 'held'::public.copy_status
      WHERE c.id = v_copy_id
        AND c.status = 'held'::public.copy_status;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'COPY_UPDATE_FAILED'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      -- No one is waiting: make the copy available.
      UPDATE public.copies c
      SET status = 'available'::public.copy_status
      WHERE c.id = v_copy_id
        AND c.status = 'held'::public.copy_status;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'COPY_UPDATE_FAILED'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    p_reservation_id,
    'cancelled'::public.reservation_status,
    v_resource_id,
    v_copy_id,
    v_promoted_reservation_id,
    v_promoted_user_id,
    v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_reservation_atomic(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cancel_reservation_atomic(uuid, uuid)
TO service_role;
