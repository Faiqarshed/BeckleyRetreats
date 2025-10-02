-- Migration for Typeform Integration Schema
-- Created: 2025-04-28

-- typeform_forms table
CREATE TABLE IF NOT EXISTS public.typeform_forms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id TEXT NOT NULL UNIQUE,
    form_title TEXT NOT NULL,
    workspace_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);

-- Add appropriate indexes
CREATE INDEX IF NOT EXISTS idx_typeform_forms_form_id ON public.typeform_forms(form_id);

-- typeform_field_versions table
CREATE TABLE IF NOT EXISTS public.typeform_field_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    form_id UUID REFERENCES public.typeform_forms(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL,
    field_title TEXT NOT NULL,
    field_type TEXT NOT NULL,
    field_ref TEXT,
    properties JSONB DEFAULT '{}'::jsonb,
    is_scored BOOLEAN DEFAULT FALSE,
    parent_field_version_id UUID REFERENCES public.typeform_field_versions(id) ON DELETE CASCADE,
    hierarchy_level INT DEFAULT 0,
    version_date TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    UNIQUE(form_id, field_id, version_date)
);

-- Add appropriate indexes
CREATE INDEX IF NOT EXISTS idx_typeform_field_versions_form_id ON public.typeform_field_versions(form_id);
CREATE INDEX IF NOT EXISTS idx_typeform_field_versions_field_id ON public.typeform_field_versions(field_id);
CREATE INDEX IF NOT EXISTS idx_typeform_field_versions_is_active ON public.typeform_field_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_typeform_field_versions_parent_id ON public.typeform_field_versions(parent_field_version_id);
CREATE INDEX IF NOT EXISTS idx_typeform_field_versions_hierarchy ON public.typeform_field_versions(hierarchy_level);

-- typeform_choice_versions table
CREATE TABLE IF NOT EXISTS public.typeform_choice_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_version_id UUID REFERENCES public.typeform_field_versions(id) ON DELETE CASCADE,
    choice_id TEXT NOT NULL,
    choice_label TEXT NOT NULL,
    choice_ref TEXT,
    version_date TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    UNIQUE(field_version_id, choice_id, version_date)
);

-- Add appropriate indexes
CREATE INDEX IF NOT EXISTS idx_typeform_choice_versions_field_version_id ON public.typeform_choice_versions(field_version_id);
CREATE INDEX IF NOT EXISTS idx_typeform_choice_versions_is_active ON public.typeform_choice_versions(is_active);

-- scoring_rules table
CREATE TABLE IF NOT EXISTS public.scoring_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type TEXT NOT NULL CHECK (target_type IN ('field', 'choice')),
    target_id UUID NOT NULL,
    score_value TEXT NOT NULL CHECK (score_value IN ('red', 'yellow', 'green')),
    criteria JSONB DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL
);

-- Add appropriate indexes
CREATE INDEX IF NOT EXISTS idx_scoring_rules_target_type_target_id ON public.scoring_rules(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_scoring_rules_score_value ON public.scoring_rules(score_value);
CREATE INDEX IF NOT EXISTS idx_scoring_rules_is_active ON public.scoring_rules(is_active);

-- Add RLS policies for typeform_forms
ALTER TABLE public.typeform_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for admins and managers"
    ON public.typeform_forms
    FOR ALL
    TO authenticated
    USING (
        (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER')
    );

CREATE POLICY "Read-only access for screeners and facilitators"
    ON public.typeform_forms
    FOR SELECT
    TO authenticated
    USING (
        (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('SCREENER_LEAD', 'SCREENER', 'FACILITATOR')
    );

-- Add RLS policies for typeform_field_versions
ALTER TABLE public.typeform_field_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for admins and managers"
    ON public.typeform_field_versions
    FOR ALL
    TO authenticated
    USING (
        (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER')
    );

CREATE POLICY "Read-only access for screeners and facilitators"
    ON public.typeform_field_versions
    FOR SELECT
    TO authenticated
    USING (
        (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('SCREENER_LEAD', 'SCREENER', 'FACILITATOR')
    );

-- Add RLS policies for typeform_choice_versions
ALTER TABLE public.typeform_choice_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for admins and managers"
    ON public.typeform_choice_versions
    FOR ALL
    TO authenticated
    USING (
        (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER')
    );

CREATE POLICY "Read-only access for screeners and facilitators"
    ON public.typeform_choice_versions
    FOR SELECT
    TO authenticated
    USING (
        (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('SCREENER_LEAD', 'SCREENER', 'FACILITATOR')
    );

-- Add RLS policies for scoring_rules
ALTER TABLE public.scoring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for admins and managers"
    ON public.scoring_rules
    FOR ALL
    TO authenticated
    USING (
        (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('PROGRAM_OPERATIONS_ADMINISTRATOR', 'PROGRAM_OPERATIONS_MANAGER')
    );

CREATE POLICY "Read-only access for screeners and facilitators"
    ON public.scoring_rules
    FOR SELECT
    TO authenticated
    USING (
        (SELECT role FROM auth.users WHERE id = auth.uid()) IN ('SCREENER_LEAD', 'SCREENER', 'FACILITATOR')
    );

-- Create triggers for updated_at timestamp
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_typeform_forms_modtime
BEFORE UPDATE ON public.typeform_forms
FOR EACH ROW EXECUTE FUNCTION update_modified_column();

CREATE TRIGGER update_scoring_rules_modtime
BEFORE UPDATE ON public.scoring_rules
FOR EACH ROW EXECUTE FUNCTION update_modified_column();
