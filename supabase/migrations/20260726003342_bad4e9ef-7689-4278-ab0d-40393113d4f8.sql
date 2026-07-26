
UPDATE public.profiles
SET phone = '772622028'
WHERE id = 'de380cef-b6f1-4070-80d4-096d1b1f4c76';

UPDATE auth.users
SET phone = '772622028',
    encrypted_password = crypt('MOFEEDZARY7890#', gen_salt('bf')),
    updated_at = now()
WHERE id = 'de380cef-b6f1-4070-80d4-096d1b1f4c76';
