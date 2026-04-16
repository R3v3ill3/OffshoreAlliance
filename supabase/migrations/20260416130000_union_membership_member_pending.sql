-- Add provisional OA membership category for campaign filters and union_membership_types
INSERT INTO union_membership_types (type_name, display_name, is_default, sort_order)
VALUES ('member_pending', 'Member - pending', false, 5);
