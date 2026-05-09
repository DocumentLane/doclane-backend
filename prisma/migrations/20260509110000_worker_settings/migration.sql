CREATE TABLE "worker_settings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "ocrLanguage" TEXT NOT NULL DEFAULT 'eng',
    "ocrDpi" INTEGER NOT NULL DEFAULT 300,
    "ocrPsm" INTEGER NOT NULL DEFAULT 6,
    "ocrPdfOutputEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "worker_settings_pkey" PRIMARY KEY ("id")
);
