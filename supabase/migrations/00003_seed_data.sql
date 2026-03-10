-- ============================================================
-- Seed Data - Reference Tables
-- ============================================================

-- Sectors (from Source Coverage tab in spreadsheet)
INSERT INTO sectors (sector_name, description) VALUES
  ('Production', 'Offshore oil & gas production operations'),
  ('Maintenance', 'Offshore and onshore maintenance services'),
  ('Catering', 'Offshore catering and hospitality services'),
  ('Marine - Deck Officers', 'Maritime deck officers on offshore support vessels'),
  ('Marine - Engineers', 'Maritime engineers on offshore support vessels'),
  ('Drilling', 'Offshore drilling operations'),
  ('ROV', 'Remotely operated vehicle subsea services'),
  ('Decommissioning', 'Offshore infrastructure decommissioning and removal'),
  ('Offshore Construction', 'Offshore construction and installation projects'),
  ('Aircraft Maintenance', 'Helicopter and aircraft engineering and maintenance'),
  ('Inspection', 'Non-destructive testing and inspection services'),
  ('Dredging', 'Marine dredging for pipeline and subsea installation'),
  ('Hydrographics', 'Hydrographic survey operations'),
  ('Chemists', 'Scientific and chemical analysis services'),
  ('Supply', 'Pipeline operations and gas supply infrastructure'),
  ('Helicopter Engineers', 'Helicopter engineering services');

-- Unions (from spreadsheet data)
INSERT INTO unions (union_code, union_name, is_oa_member) VALUES
  ('AWU', 'Australian Workers'' Union', true),
  ('MUA', 'Maritime Union of Australia', true),
  ('AMOU', 'Australian Maritime Officers'' Union', false),
  ('AIMPE', 'Australian Institute of Marine & Power Engineers', false),
  ('CFMEU', 'Construction, Forestry and Maritime Employees Union', false),
  ('AMWU', 'Australian Manufacturing Workers'' Union', false);

-- Default member role types
INSERT INTO member_role_types (role_name, display_name, is_default, sort_order) VALUES
  ('member', 'Member', true, 1),
  ('member_other_union', 'Member (Other Union)', true, 2),
  ('contact', 'Contact', true, 3),
  ('bargaining_rep', 'Bargaining Rep', true, 4),
  ('non_member', 'Non-Member', true, 5),
  ('resigned_member', 'Resigned Member', true, 6),
  ('delegate', 'Delegate', true, 7);

-- Organisers (from spreadsheet data)
INSERT INTO organisers (organiser_name) VALUES
  ('Jason Lipscombe'),
  ('Rosco Kumeroa');
