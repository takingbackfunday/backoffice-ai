import { DocUploadClient } from '@/components/public/doc-upload-client'

interface PageParams { params: Promise<{ token: string }> }

export default async function DocUploadPage({ params }: PageParams) {
  const { token } = await params
  return <DocUploadClient token={token} />
}
