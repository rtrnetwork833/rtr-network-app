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

CREATE TABLE IF NOT EXISTS public.user_mining_balances (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    claimed_balance NUMERIC NOT NULL DEFAULT 0,
    last_accrued_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_mining_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own mining balance" ON public.user_mining_balances;
CREATE POLICY "Users can read their own mining balance"
ON public.user_mining_balances FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.claim_mining_accrual()
RETURNS TABLE (claimed_balance NUMERIC, accrued_at TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_now TIMESTAMP WITH TIME ZONE := clock_timestamp();
    v_balance NUMERIC;
    v_last_accrued_at TIMESTAMP WITH TIME ZONE;
    v_earned NUMERIC := 0;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    INSERT INTO public.user_mining_balances (user_id, claimed_balance)
    SELECT profile.id, COALESCE(NULLIF(profile.balance::TEXT, '')::NUMERIC, 0)
    FROM public.profiles AS profile
    WHERE profile.id = v_user_id
    ON CONFLICT (user_id) DO NOTHING;

    SELECT mining_balance.claimed_balance, mining_balance.last_accrued_at
    INTO v_balance, v_last_accrued_at
    FROM public.user_mining_balances AS mining_balance
    WHERE mining_balance.user_id = v_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profile not found for authenticated user';
    END IF;

    IF v_last_accrued_at IS NULL THEN
        SELECT COALESCE(MIN(activation.activated_at), v_now)
        INTO v_last_accrued_at
        FROM public.booster_activations AS activation
        WHERE activation.user_id = v_user_id
            AND activation.activated_at < v_now
            AND activation.expires_at > activation.activated_at;
    END IF;

    SELECT COALESCE(SUM(
        EXTRACT(EPOCH FROM (
            LEAST(activation.expires_at, v_now)
            - GREATEST(activation.activated_at, v_last_accrued_at)
        )) * CASE activation.tier
            WHEN 'Free Node Booster' THEN 0.16::NUMERIC
            WHEN 'Starter Utility Boost' THEN 0.66::NUMERIC
            WHEN 'Silver Protocol License' THEN 1.66::NUMERIC
            WHEN 'Gold Protocol License' THEN 3.33::NUMERIC
            WHEN 'Premium Platform Booster' THEN 6.66::NUMERIC
            WHEN 'Advanced Network Tier' THEN 16.66::NUMERIC
            WHEN 'Master Infrastructure Pass' THEN 25.00::NUMERIC
            WHEN 'Regional Allocation Access' THEN 50.00::NUMERIC
            WHEN 'Continental System License' THEN 116.66::NUMERIC
            WHEN 'Global System Core' THEN 166.66::NUMERIC
            WHEN 'Sovereign Genesis License' THEN 333.33::NUMERIC
            ELSE 0::NUMERIC
        END / 86400
    ), 0)
    INTO v_earned
    FROM public.booster_activations AS activation
    WHERE activation.user_id = v_user_id
        AND activation.activated_at < v_now
        AND activation.expires_at > v_last_accrued_at;

    UPDATE public.user_mining_balances AS mining_balance
    SET claimed_balance = v_balance + v_earned,
        last_accrued_at = v_now,
        updated_at = v_now
    WHERE mining_balance.user_id = v_user_id;

    RETURN QUERY SELECT v_balance + v_earned, v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mining_accrual() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_mining_accrual() TO authenticated;

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