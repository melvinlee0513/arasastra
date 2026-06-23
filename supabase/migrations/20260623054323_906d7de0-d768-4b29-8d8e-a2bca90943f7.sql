CREATE POLICY "Tutors can insert their own classes" ON public.classes FOR INSERT TO authenticated WITH CHECK (
  is_admin() OR tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid()) OR has_role(auth.uid(), 'tutor')
);
CREATE POLICY "Tutors can update their own classes" ON public.classes FOR UPDATE TO authenticated USING (
  is_admin() OR tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
);
CREATE POLICY "Tutors can delete their own classes" ON public.classes FOR DELETE TO authenticated USING (
  is_admin() OR tutor_id IN (SELECT id FROM public.tutors WHERE user_id = auth.uid())
);