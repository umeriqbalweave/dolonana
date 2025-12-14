import { supabase } from "@/lib/supabaseClient";

export async function uploadImage(
  bucket: string,
  file: File,
  prefix: string,
): Promise<string | null> {
  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${prefix}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) {
    console.error("upload error", error.message);
    return null;
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
