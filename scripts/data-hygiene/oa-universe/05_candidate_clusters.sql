-- 05 · Near-duplicate clusters (read-only). Heuristic: first significant token after stripping
-- legal suffixes and generic words. Every cluster is a question for the adjudication worksheet,
-- not a merge instruction.
WITH e AS (
  SELECT employer_id, employer_name,
         trim(regexp_replace(regexp_replace(lower(employer_name),
              '\m(pty|ltd|limited|pl|inc|group|the|australia|australian|aust|international|pte|plc|asa|services|energy|offshore|marine)\M', ' ', 'g'),
              '[^a-z0-9]+', ' ', 'g')) AS norm
  FROM employers)
SELECT split_part(norm,' ',1) AS key, count(*) AS n,
       string_agg(employer_id||':'||employer_name, ' || ' ORDER BY employer_id) AS members
FROM e WHERE length(split_part(norm,' ',1)) >= 3
GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC, key;

WITH w AS (
  SELECT worksite_id, worksite_name, worksite_type,
         trim(regexp_replace(regexp_replace(lower(worksite_name),
              '\m(mv|the|fpso|fpu|flng|platform|vessel|complex|offshore|onshore|plant|gas|lng|cpf|hub|island|project|construction)\M', ' ', 'g'),
              '[^a-z0-9]+', ' ', 'g')) AS norm
  FROM worksites)
SELECT split_part(norm,' ',1) AS key, count(*) AS n,
       string_agg(worksite_id||':'||worksite_name||' ['||worksite_type||']', ' || ' ORDER BY worksite_id) AS members
FROM w WHERE length(split_part(norm,' ',1)) >= 3
GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC, key;

-- Exact duplicates after case/space folding
SELECT lower(regexp_replace(worksite_name,'\s+',' ','g')) AS folded, count(*), string_agg(worksite_id::text, ',')
FROM worksites GROUP BY 1 HAVING count(*) > 1;
SELECT lower(regexp_replace(employer_name,'\s+',' ','g')) AS folded, count(*), string_agg(employer_id::text, ',')
FROM employers GROUP BY 1 HAVING count(*) > 1;
