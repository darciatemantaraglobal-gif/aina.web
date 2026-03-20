-- Fix: knowledge_base INSERT policy sebelumnya hanya cek auth.uid() = author_id
-- tanpa verifikasi apakah user punya role contributor.
-- Artinya user biasa bisa submit artikel langsung via API.
-- Fix ini menambahkan role check sehingga hanya contributor/senior_contributor/admin
-- yang bisa insert artikel.

DROP POLICY IF EXISTS "Contributors can insert articles" ON public.knowledge_base;

CREATE POLICY "Contributors can insert articles"
ON public.knowledge_base FOR INSERT
WITH CHECK (
  auth.uid() = author_id
  AND (
    public.has_role(auth.uid(), 'contributor')
    OR public.has_role(auth.uid(), 'senior_contributor')
    OR public.has_role(auth.uid(), 'admin')
  )
);
