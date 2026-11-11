-- Better Auth lower-cases every email before looking a user up, but legacy
-- users were carried over with their emails as stored (Apple can return mixed
-- case), under a case-sensitive unique index. Normalise them so a legacy
-- "John@icloud.com" is found by a later Google or password sign-in instead of
-- getting a second, empty account.

-- Stop before touching anything if two users would collapse onto one email.
DO $$
DECLARE
  collisions text;
BEGIN
  SELECT string_agg(normalized, ', ' ORDER BY normalized) INTO collisions
  FROM (
    SELECT lower(trim("email")) AS normalized
    FROM "User"
    GROUP BY lower(trim("email"))
    HAVING count(*) > 1
  ) AS dupes;

  IF collisions IS NOT NULL THEN
    RAISE EXCEPTION 'Users share an email that differs only by case or surrounding spaces: %. Merge or delete the duplicate user, then run `npx prisma migrate resolve --rolled-back 20260928120000_normalize_user_email` and re-run `npx prisma migrate deploy`.', collisions;
  END IF;
END $$;

UPDATE "User" SET "email" = lower(trim("email")) WHERE "email" <> lower(trim("email"));
