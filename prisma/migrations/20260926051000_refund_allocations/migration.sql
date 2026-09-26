ALTER TABLE "PaymentAllocation"
  DROP CONSTRAINT "PaymentAllocation_amount_positive";

ALTER TABLE "PaymentAllocation"
  ADD CONSTRAINT "PaymentAllocation_amount_nonzero" CHECK ("amount" <> 0);
