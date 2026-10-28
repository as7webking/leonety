-- Allow the product image pipeline to retain transparent PNG/WebP assets.
-- Preserve any other MIME types already configured on the bucket.
update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct mime_type order by mime_type)
  from unnest(
    coalesce(storage.buckets.allowed_mime_types, '{}'::text[])
    || array['image/jpeg', 'image/png', 'image/webp']::text[]
  ) as allowed(mime_type)
)
where id = 'product-images';
