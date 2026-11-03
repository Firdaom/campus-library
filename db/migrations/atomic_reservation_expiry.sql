
-- ============================================================================
-- Campus Library — Atomic Reservation Expiry
-- Expires ready reservations and promotes the next FIFO reservation.
-- Uses the resource row as the shared queue lock.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.expire_reservation_atomic(
  p_reservation_id uuid
)
RETURNS TABLE (
  reservation_id uuid,
  resource_id uuid,
  expired_copy_id uuid,
  promoted_reservation_id uuid,
  promoted_user_id uuid,
  expires_at timestamptz
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_resource_id uuid;
  v_copy_id uuid;
  v_promoted_reservation_id uuid;
  v_promoted_user_id uuid;
  v_expires_at timestamptz;
BEGIN
  IF p_reservation_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS'
      USING ERRCODE = '22023';
  END IF;

  -- Find the resource before acquiring the shared lock.
  SELECT r.resource_id, r.held_copy_id
  INTO v_resource_id, v_copy_id
  FROM public.reservations r
  WHERE r.id = p_reservation_id
    AND r.status = 'ready'::public.reservation_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_READY'
      USING ERRCODE = 'P0001';
  END IF;

  -- All queue-changing operations must lock this resource first.
  PERFORM 1
  FROM public.resources r
  WHERE r.id = v_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock and re-check the reservation after acquiring the resource lock.
  PERFORM 1
  FROM public.reservations r
  WHERE r.id = p_reservation_id
    AND r.resource_id = v_resource_id
    AND r.status = 'ready'::public.reservation_status
    AND r.expires_at <= now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_EXPIRED_OR_ALREADY_PROCESSED'
      USING ERRCODE = 'P0001';
  END IF;

  -- Lock and validate the held copy.
  IF v_copy_id IS NOT NULL THEN
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

  -- Mark the reservation as expired.
  UPDATE public.reservations r
  SET status = 'expired'::public.reservation_status
  WHERE r.id = p_reservation_id
    AND r.status = 'ready'::public.reservation_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_EXPIRY_FAILED'
      USING ERRCODE = 'P0001';
  END IF;

  -- If there is no held copy, expiry is complete.
  IF v_copy_id IS NOT NULL THEN
    -- Find the next reservation in FIFO order.
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

      UPDATE public.copies c
      SET status = 'held'::public.copy_status
      WHERE c.id = v_copy_id
        AND c.status = 'held'::public.copy_status;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'COPY_UPDATE_FAILED'
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
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
    v_resource_id,
    v_copy_id,
    v_promoted_reservation_id,
    v_promoted_user_id,
    v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_reservation_atomic(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.expire_reservation_atomic(uuid)
TO service_role;
