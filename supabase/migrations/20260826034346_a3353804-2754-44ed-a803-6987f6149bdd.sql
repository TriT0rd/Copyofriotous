CREATE POLICY "Customers upload own return photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'returns'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Customers read own return photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'returns'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );