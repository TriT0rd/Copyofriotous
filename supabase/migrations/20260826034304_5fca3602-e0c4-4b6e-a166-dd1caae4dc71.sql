CREATE OR REPLACE FUNCTION private.return_transition_allowed(_old text, _new text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _old = _new THEN true
    WHEN _old = 'Return Requested' THEN _new IN ('Under Review','Approved','Rejected','Return Cancelled')
    WHEN _old = 'Under Review' THEN _new IN ('Approved','Rejected','Return Cancelled')
    WHEN _old = 'Approved' THEN _new IN ('Pickup Scheduled','Return Cancelled')
    WHEN _old = 'Pickup Scheduled' THEN _new IN ('Picked Up','Return Cancelled')
    WHEN _old = 'Picked Up' THEN _new IN ('Received')
    WHEN _old = 'Received' THEN _new IN ('Refund Processing','Refunded')
    WHEN _old = 'Refund Processing' THEN _new IN ('Refunded')
    ELSE false
  END
$$;