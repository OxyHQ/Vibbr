-- oxy:deploy-phase=pre
ALTER TABLE "organizers" ADD COLUMN "federated" boolean DEFAULT false NOT NULL;