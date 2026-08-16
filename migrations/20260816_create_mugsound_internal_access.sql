-- Internal-only access control for MugSound Supply Studio.
-- This does not expose MugSound production features to normal Melodio users.

CREATE TABLE IF NOT EXISTS public.mugsound_operator_roles (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('producer', 'qa', 'approver')),
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_mugsound_operator_roles_role
  ON public.mugsound_operator_roles (role, granted_at DESC);

ALTER TABLE public.mugsound_operator_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "MugSound operators can view own roles"
  ON public.mugsound_operator_roles;
CREATE POLICY "MugSound operators can view own roles"
  ON public.mugsound_operator_roles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.mugsound_operator_roles FROM anon;
GRANT SELECT ON public.mugsound_operator_roles TO authenticated;
GRANT ALL ON public.mugsound_operator_roles TO service_role;

COMMENT ON TABLE public.mugsound_operator_roles IS
  'Internal MugSound Supply Studio roles. Assignments are administered through service-role operations only.';
