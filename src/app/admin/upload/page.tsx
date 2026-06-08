import { UploadClient } from "./UploadClient";

export const dynamic = "force-dynamic";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">매출 엑셀 업로드</h1>
        <p className="mt-1 text-sm text-gray-500">
          매출현황.xlsx 파일을 업로드하여 매출 데이터를 등록합니다.
        </p>
      </div>
      <UploadClient />
    </div>
  );
}
