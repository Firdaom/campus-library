-- Atomic copy creation
-- Lock the resource before inserting a new copy.

CREATE OR REPLACE FUNCTION public.add_copy_atomic(
  p_resource_id uuid
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
BEGIN
  IF p_resource_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS';
  END IF;

  -- 1. Lock the resource row first.
  SELECT id
  INTO v_resource_id
  FROM public.resources
  WHERE id = p_resource_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_NOT_FOUND';
  END IF;

  -- 2. Insert the new copy as available.
  INSERT INTO public.copies (
    resource_id,
    status
  )
  VALUES (
    v_resource_id,
    'available'
  )
  RETURNING id, status::text
  INTO v_copy_id, v_status;

  -- 3. Return the created copy.
  RETURN jsonb_build_object(
    'id', v_copy_id,
    'resource_id', v_resource_id,
    'status', v_status
  );
END;
$$;

-- Only the server-side service role may execute this function.
REVOKE ALL ON FUNCTION public.add_copy_atomic(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.add_copy_atomic(uuid)
TO service_role;