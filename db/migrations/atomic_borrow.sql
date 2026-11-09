
-- ============================================================================
-- Campus Library — Atomic Borrow RPC
-- Creates a loan and updates the copy status in one transaction.
-- Resource Lock must be acquired before User and Copy locks.
-- Only the backend service_role can execute this function.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_loan_atomic(
  p_user_id uuid,
  p_copy_id uuid,
  p_resource_id uuid,
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

  v_resource_id uuid;
  v_copy_id uuid;
  v_copy_resource_id uuid;
  v_copy_status public.copy_status;

  v_active_count integer;
  v_loan_id uuid;
  v_due_at timestamptz;
BEGIN
  -- 1. Validate arguments.
  IF p_user_id IS NULL
     OR p_due_at IS NULL
     OR p_max_active_loans IS NULL
     OR p_max_active_loans < 1 THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS'
      USING ERRCODE = '22023';
  END IF;

  IF (p_copy_id IS NULL AND p_resource_id IS NULL)
     OR (p_copy_id IS NOT NULL AND p_resource_id IS NOT NULL) THEN
    RAISE EXCEPTION 'PROVIDE_COPY_OR_RESOURCE'
      USING ERRCODE = '22023';
  END IF;

  -- 2. Resolve resource ID without locking other rows.
  IF p_copy_id IS NOT NULL THEN
    SELECT c.resource_id
    INTO v_resource_id
    FROM public.copies c
    WHERE c.id = p_copy_id;

    IF NOT FOUND OR v_resource_id IS NULL THEN
      RAISE EXCEPTION 'COPY_UNAVAILABLE'
        USING ERRCODE = 'P0001';
    END IF;
  ELSE
    v_resource_id := p_resource_id;
  END IF;

  -- 3. Lock the resource FIRST.
  PERFORM 1
  FROM public.resources r
  WHERE r.id = v_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- 4. Lock borrower and verify account status.
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

  -- 5. Lock and validate one available copy.
  IF p_copy_id IS NOT NULL THEN

    SELECT c.id, c.resource_id, c.status
    INTO v_copy_id, v_copy_resource_id, v_copy_status
    FROM public.copies c
    WHERE c.id = p_copy_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_copy_resource_id IS DISTINCT FROM v_resource_id
       OR v_copy_status IS DISTINCT FROM 'available'::public.copy_status THEN
      RAISE EXCEPTION 'COPY_UNAVAILABLE'
        USING ERRCODE = 'P0001';
    END IF;

  ELSE

    SELECT c.id, c.resource_id, c.status
    INTO v_copy_id, v_copy_resource_id, v_copy_status
    FROM public.copies c
    WHERE c.resource_id = v_resource_id
      AND c.status = 'available'::public.copy_status
    ORDER BY c.created_at, c.id
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'NO_AVAILABLE_COPY'
        USING ERRCODE = 'P0001';
    END IF;

  END IF;

  -- 6. Enforce the active-loan limit.
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

  -- 7. Create the loan.
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

  -- 8. Mark the copy as loaned.
  UPDATE public.copies
  SET
    status = 'loaned'::public.copy_status,
    updated_at = now()
  WHERE public.copies.id = v_copy_id
    AND public.copies.status = 'available'::public.copy_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'COPY_UNAVAILABLE'
      USING ERRCODE = 'P0001';
  END IF;

  -- 9. Return the created loan.
  RETURN QUERY
  SELECT v_loan_id, v_copy_id, p_user_id, v_due_at;

END;
$$;

-- Only the backend service role may call this RPC.
REVOKE ALL ON FUNCTION public.create_loan_atomic(
  uuid, uuid, uuid, timestamptz, integer
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_loan_atomic(
  uuid, uuid, uuid, timestamptz, integer
) TO service_role;
