-- 1. Safely add the missing recovery_code column to your profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS recovery_code TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- 2. Safely create the booster_activations table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.booster_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tier TEXT NOT NULL,
    activated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.booster_activations
ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

ALTER TABLE public.booster_activations
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.booster_activations
ADD COLUMN IF NOT EXISTS tier TEXT;

ALTER TABLE public.booster_activations
ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.booster_activations
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

UPDATE public.booster_activations
SET id = gen_random_uuid()
WHERE id IS NULL;

ALTER TABLE public.booster_activations
ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.booster_activations
ALTER COLUMN id SET NOT NULL;

DO $$
DECLARE
    unique_constraint_name TEXT;
    unique_index_name TEXT;
    user_id_attnum SMALLINT;
    tier_attnum SMALLINT;
BEGIN
    SELECT attnum INTO user_id_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.booster_activations'::regclass AND attname = 'user_id';

    SELECT attnum INTO tier_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.booster_activations'::regclass AND attname = 'tier';

    FOR unique_constraint_name IN
        SELECT constraint_definition.conname
        FROM pg_constraint AS constraint_definition
        WHERE constraint_definition.conrelid = 'public.booster_activations'::regclass
            AND constraint_definition.contype = 'u'
            AND cardinality(constraint_definition.conkey) = 2
            AND constraint_definition.conkey @> ARRAY[user_id_attnum, tier_attnum]
    LOOP
        EXECUTE format('ALTER TABLE public.booster_activations DROP CONSTRAINT %I', unique_constraint_name);
    END LOOP;

    FOR unique_index_name IN
        SELECT index_relation.relname
        FROM pg_index AS index_definition
        JOIN pg_class AS index_relation ON index_relation.oid = index_definition.indexrelid
        WHERE index_definition.indrelid = 'public.booster_activations'::regclass
            AND index_definition.indisunique
            AND index_definition.indnkeyatts = 2
            AND NOT EXISTS (
                SELECT 1
                FROM pg_constraint AS constraint_definition
                WHERE constraint_definition.conindid = index_definition.indexrelid
            )
            AND (
                (index_definition.indkey[0] = user_id_attnum AND index_definition.indkey[1] = tier_attnum)
                OR (index_definition.indkey[0] = tier_attnum AND index_definition.indkey[1] = user_id_attnum)
            )
    LOOP
        EXECUTE format('DROP INDEX public.%I', unique_index_name);
    END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS booster_activations_user_expiry_idx
ON public.booster_activations (user_id, expires_at);

-- 3. Enable security on the booster activations table
ALTER TABLE public.booster_activations ENABLE ROW LEVEL SECURITY;

-- 4. Clean up and apply the booster activation security rules safely
DROP POLICY IF EXISTS "Users can read their own booster activations" ON public.booster_activations;
CREATE POLICY "Users can read their own booster activations"
ON public.booster_activations FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own booster activations" ON public.booster_activations;
CREATE POLICY "Users can create their own booster activations"
ON public.booster_activations FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own booster activations" ON public.booster_activations;
CREATE POLICY "Users can update their own booster activations"
ON public.booster_activations FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.transactions (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'swap', 'withdrawal')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    platform TEXT NOT NULL CHECK (platform IN ('Meld', 'Native'))
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own transactions" ON public.transactions;
CREATE POLICY "Users can read their own transactions"
ON public.transactions FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own transactions" ON public.transactions;
CREATE POLICY "Users can insert their own transactions"
ON public.transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS transactions_user_id_idx
ON public.transactions (user_id);