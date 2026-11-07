Team 12
   |
   | Authorization: Bearer <integration-key>
   v
GET /api/resources
   |
   v
requireIntegration()
   |
   v
Supabase Anon Client
   |
   v
RLS + SELECT permissions
   |
   v
resource_availability