CREATE TYPE "ResourcePermission" AS ENUM ('READ');

CREATE TABLE "oidc_groups" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oidc_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_group_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_group_memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "folder_permissions" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "userId" TEXT,
    "groupId" TEXT,
    "permission" "ResourcePermission" NOT NULL DEFAULT 'READ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folder_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "document_permissions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT,
    "groupId" TEXT,
    "permission" "ResourcePermission" NOT NULL DEFAULT 'READ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_permissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "groupsInitializedAt" TIMESTAMP(3);
ALTER TABLE "folders" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "oidc_groups_issuer_externalId_key" ON "oidc_groups"("issuer", "externalId");
CREATE INDEX "oidc_groups_externalId_idx" ON "oidc_groups"("externalId");
CREATE UNIQUE INDEX "user_group_memberships_userId_groupId_key" ON "user_group_memberships"("userId", "groupId");
CREATE INDEX "user_group_memberships_groupId_idx" ON "user_group_memberships"("groupId");
CREATE UNIQUE INDEX "folder_permissions_folderId_userId_key" ON "folder_permissions"("folderId", "userId");
CREATE UNIQUE INDEX "folder_permissions_folderId_groupId_key" ON "folder_permissions"("folderId", "groupId");
CREATE INDEX "folder_permissions_userId_idx" ON "folder_permissions"("userId");
CREATE INDEX "folder_permissions_groupId_idx" ON "folder_permissions"("groupId");
CREATE UNIQUE INDEX "document_permissions_documentId_userId_key" ON "document_permissions"("documentId", "userId");
CREATE UNIQUE INDEX "document_permissions_documentId_groupId_key" ON "document_permissions"("documentId", "groupId");
CREATE INDEX "document_permissions_userId_idx" ON "document_permissions"("userId");
CREATE INDEX "document_permissions_groupId_idx" ON "document_permissions"("groupId");
CREATE INDEX "folders_isPublic_idx" ON "folders"("isPublic");

ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_group_memberships" ADD CONSTRAINT "user_group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "oidc_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folder_permissions" ADD CONSTRAINT "folder_permissions_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folder_permissions" ADD CONSTRAINT "folder_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "folder_permissions" ADD CONSTRAINT "folder_permissions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "oidc_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_permissions" ADD CONSTRAINT "document_permissions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "oidc_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
