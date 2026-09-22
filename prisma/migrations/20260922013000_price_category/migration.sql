ALTER TABLE "PriceRule" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'PHONE';
DROP INDEX "PriceRule_brand_series_model_project_key";
CREATE UNIQUE INDEX "PriceRule_category_brand_series_model_project_key"
ON "PriceRule"("category", "brand", "series", "model", "project");

