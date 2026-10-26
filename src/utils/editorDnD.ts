export interface MaterialDropPayload {
  relativePath: string;
  itemType: "file" | "folder";
}

export function getMaterialDropPayload(dataTransfer: DataTransfer): MaterialDropPayload | null {
  const structuredPayload = dataTransfer.getData("application/teacherpro-material");
  let relativePath = "";
  let itemType: "file" | "folder" = "file";

  if (structuredPayload) {
    try {
      const parsed = JSON.parse(structuredPayload) as {
        relativePath?: string;
        isDirectory?: boolean;
        itemType?: "file" | "folder";
      };
      relativePath = parsed.relativePath || "";
      itemType =
        parsed.isDirectory || parsed.itemType === "folder" ? "folder" : "file";
    } catch {
      relativePath = "";
    }
  }

  if (!relativePath) {
    relativePath = dataTransfer.getData("application/teacherpro-file");
  }

  if (!relativePath) {
    relativePath = dataTransfer.getData("text/plain");
  }

  if (!relativePath || itemType === "folder") {
    return null;
  }

  return { relativePath, itemType };
}
export function hasMethodDropData(dataTransfer: DataTransfer): boolean {
  return hasTransferType(dataTransfer, "application/teacherpro-method");
}

export function hasTransferType(dataTransfer: DataTransfer, type: string): boolean {
  return Array.from(dataTransfer.types || []).includes(type);
}

export function hasMaterialDropData(dataTransfer: DataTransfer): boolean {
  if (hasMethodDropData(dataTransfer)) {
    return false;
  }

  return (
    hasTransferType(dataTransfer, "application/teacherpro-material") ||
    hasTransferType(dataTransfer, "application/teacherpro-file")
  );
}
