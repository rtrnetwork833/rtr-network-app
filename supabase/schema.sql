-- 1. Safely add the missing recovery_code column to your profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS recovery_code TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS wallet_address TEXT;

-- 2. Safely create the booster_activations table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.booster_activations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

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
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    wallet_address TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'swap', 'withdrawal')),
    amount NUMERIC NOT NULL CHECK (amount >= 0),
    token_symbol TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
    tx_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own transactions" ON public.transactions;
CREATE POLICY "Users can read their own transactions"
ON public.transactions FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS transactions_user_wallet_created_at_idx
ON public.transactions (user_id, wallet_address, created_at DESC);