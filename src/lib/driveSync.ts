import { getDriveAccessToken } from './driveAuth';

const FOLDER_NAME = '億達行商品圖庫 (Product Images)';
let cachedFolderId: string | null = null;

// Get or create the dedicated folder in Google Drive
export async function getOrCreateDriveFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  // 1. Search for existing folder
  const query = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and name = '${FOLDER_NAME}' and trashed = false`
  );
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (searchRes.ok) {
    const data = await searchRes.json();
    if (data.files && data.files.length > 0) {
      cachedFolderId = data.files[0].id;
      return cachedFolderId!;
    }
  }

  // 2. Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });

  if (createRes.ok) {
    const folder = await createRes.json();
    cachedFolderId = folder.id;
    return cachedFolderId!;
  }

  throw new Error('無法在 Google Drive 建立商品圖庫資料夾');
}

// Upload a base64 image directly to Google Drive folder
export async function uploadImageToDrive(
  filename: string,
  base64Data: string,
  mimeType: string = 'image/jpeg'
): Promise<{ success: boolean; fileId?: string; error?: string }> {
  const token = getDriveAccessToken();
  if (!token) {
    return { success: false, error: '尚未登入 Google Drive，未自動備份至 Drive' };
  }

  try {
    const folderId = await getOrCreateDriveFolder(token);

    // Clean base64
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: mimeType });

    // Check if file already exists in folder to update or create
    const checkQuery = encodeURIComponent(
      `name = '${filename}' and '${folderId}' in parents and trashed = false`
    );
    const checkRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${checkQuery}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    let existingFileId: string | null = null;
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      if (checkData.files && checkData.files.length > 0) {
        existingFileId = checkData.files[0].id;
      }
    }

    if (existingFileId) {
      // Update existing file content
      const updateRes = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': mimeType
          },
          body: blob
        }
      );
      if (updateRes.ok) {
        return { success: true, fileId: existingFileId };
      }
    }

    // Multipart upload to create new file inside folder
    const metadata = {
      name: filename,
      parents: [folderId],
      mimeType: mimeType
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: form
      }
    );

    if (uploadRes.ok) {
      const data = await uploadRes.json();
      return { success: true, fileId: data.id };
    } else {
      const err = await uploadRes.text();
      return { success: false, error: err };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
