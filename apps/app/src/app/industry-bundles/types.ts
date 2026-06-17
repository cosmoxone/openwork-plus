export type IndustryBundleCatalogEntry = {
  id: string;
  name: string;
  version: string;
  description?: string;
  source?: string;
  path?: string;
  downloadUrl?: string | null;
  sha256?: string | null;
  installed: boolean;
  installedVersion?: string | null;
  installedAt?: string | null;
  updateAvailable: boolean;
  status: string;
  featured?: boolean;
};

export type IndustryBundleInstallResult = {
  id: string;
  version: string;
  sourceKind?: string;
};

export type IndustryBundleUiManifest = {
  schema_version?: string;
  schemaVersion?: string;
  bundles?: Array<{ id: string; name?: string; version?: string; routes?: string[] }>;
};
