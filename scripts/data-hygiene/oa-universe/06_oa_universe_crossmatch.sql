-- 06 · OA Universe → database keyword cross-match (read-only). Patterns are deliberately loose;
-- a hit is a candidate to confirm, a miss is a gap to fill.
WITH k(asset, pat) AS (VALUES
 ('North Rankin Complex','%rankin%'),('Goodwyn A','%goodwyn%'),('Angel','%angel%'),('NWS subsea tiebacks','%nws%'),
 ('Pluto A','%pluto%'),('Scarborough FPU','%scarborough%'),('Ngujima-Yin FPSO','%ngujima%'),('Pyrenees Venture FPSO','%pyrenees%'),
 ('Okha FPSO','%okha%'),('Macedon','%macedon%'),('Julimar-Brunello','%julimar%'),('Bass Strait platforms','%bass%'),
 ('Enfield','%enfield%'),('Stybarrow','%stybarrow%'),('Griffin','%griffin%'),('Minerva','%minerva%'),('Browse','%browse%'),
 ('Greater Sunrise','%sunrise%'),('Barossa','%barossa%'),('BW Opal','%opal%'),('Bayu-Undan','%bayu%'),('Ningaloo Vision','%ningaloo%'),
 ('John Brookes','%brookes%'),('Spar / East Spar','%spar%'),('Halyard','%halyard%'),('Spartan','%spartan%'),('Reindeer','%reindeer%'),
 ('Mutineer-Exeter','%mutineer%'),('Fletcher-Finucane','%fletcher%'),('Dorado','%dorado%'),('Corvus','%corvus%'),
 ('Wheatstone Platform','%wheatstone%'),('Gorgon / Jansz-Io subsea','%gorgon%'),('Jansz-Io Compression','%jansz%'),
 ('Barrow Island','%barrow%'),('Thevenard Island','%thevenard%'),('Ichthys Explorer (CPF)','%ichthys%'),('Ichthys Venturer (FPSO)','%venturer%'),
 ('Prelude FLNG','%prelude%'),('Crux','%crux%'),('Montara','%montara%'),('Stag','%stag%'),('Buffalo','%buffalo%'),('Elang/Kakatua','%elang%'),
 ('Northern Endeavour','%endeavour%'),('Harriet Alpha','%harriet%'),('Campbell platform','%campbell%'),
 ('Karratha Gas Plant','%karratha%'),('Varanus Island','%varanus%'),('Darwin / Bladin Point','%darwin%'),('Onslow','%onslow%'),
 ('Pluto 2','%pluto 2%'),('Waitsia','%waitsia%'),('DLNG','%dlng%'),('Wandoo','%wandoo%'))
SELECT k.asset, coalesce(string_agg(w.worksite_id||':'||w.worksite_name||' ['||w.worksite_type||CASE WHEN w.is_offshore THEN ',off' ELSE ',on' END||']', ' | ' ORDER BY w.worksite_id), '— NO MATCH —') AS db_worksites
FROM k LEFT JOIN worksites w ON lower(w.worksite_name) LIKE k.pat
GROUP BY k.asset ORDER BY k.asset;

WITH k(company, pat) AS (VALUES
 ('Altrad','%altrad%'),('Altrad Sparrows','%sparrows%'),('AOS','%offshore solutions%'),('Applus+','%applus%'),('Programmed','%programmed%'),
 ('Atlas Professionals','%atlas%'),('Auriga Aviation','%auriga%'),('Baker Hughes','%baker%'),('Bhagwan Marine','%bhagwan%'),('Boskalis','%boskalis%'),
 ('CHC','%chc%'),('Condex','%condex%'),('Cyan Renewables','%cyan%'),('MMA Offshore','%mma%'),('DOF','%dof%'),('EnerMech','%enermech%'),
 ('Entier','%entier%'),('Eris','%eris%'),('Kuiper','%kuiper%'),('ESS / Compass','%compass%'),('Fugro','%fugro%'),('GGC','%ggc%'),
 ('Go Offshore','%go offshore%'),('GR Production Services','%gr production%'),('Heerema','%heerema%'),('Helix','%helix%'),('IAS','%ias%'),
 ('Kaefer','%kaefer%'),('Isologics','%isologic%'),('Legeneering','%legeneering%'),('LifeFlight','%lifeflight%'),('McDermott','%mcdermott%'),
 ('Monadelphous','%monadelphous%'),('MWOG','%mwog%'),('Noble','%noble%'),('Diamond Offshore','%diamond%'),('Oceaneering','%oceaneering%'),
 ('OSA','%offshore services australasia%'),('OSM','%osm%'),('Parabellum','%parabellum%'),('Petrofac','%petrofac%'),('PHI','%phi%'),
 ('Reach Subsea','%reach%'),('Sea1','%sea1%'),('Siem','%siem%'),('SGS','%sgs%'),('Siera','%siera%'),('Sodexo','%sodexo%'),('Solstad','%solstad%'),
 ('Technip','%technip%'),('Tidewater','%tidewater%'),('TMT','%total marine%'),('Sedco Forex','%sedco%'),('Transocean','%transocean%'),
 ('UGL','%ugl%'),('UPS','%upstream production%'),('Valaris','%valaris%'),('Ensco','%ensco%'),('Vertech','%vertech%'),('Weststar','%weststar%'),
 ('Wood','wood%'),('WPF Duratec','%duratec%'),('Saipem','%saipem%'),('Allseas','%allseas%'),('Subsea7','%subsea%'),('Van Oord','%van oord%'),
 ('Vantris / Sapura','%vantris%'),('Sapura','%sapura%'),('DeepOcean / Shelf Subsea','%shelf%'),('MODEC','%modec%'),('BW Offshore','bw%'),
 ('Woodside','%woodside%'),('Santos','%santos%'),('Chevron','%chevron%'),('Inpex','%inpex%'),('Shell','%shell%'),('Jadestone','%jadestone%'),
 ('Vermilion','%vermilion%'),('Esso/ExxonMobil','%esso%'),('Bechtel','%bechtel%'),('Ventia','%ventia%'),('Downer','%downer%'),('KBSS','%kbss%'),
 ('Ertech','%ertech%'),('Powertech','%powertech%'),('Cleanaway','%cleanaway%'),('NES Fircroft','%fircroft%'),('C2O','%c2o%'))
SELECT k.company, coalesce(string_agg(e.employer_id||':'||e.employer_name||' ('||coalesce(e.employer_category,'-')||')', ' | ' ORDER BY e.employer_id), '— NO MATCH —') AS db_employers
FROM k LEFT JOIN employers e ON lower(e.employer_name) LIKE k.pat
GROUP BY k.company ORDER BY k.company;
