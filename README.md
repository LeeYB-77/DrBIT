# DrBit 정산

담당자별 매출 / 수금 / 수수료 정산 웹앱. 관리자가 매출 엑셀을 업로드하고, 수금을 체크한 뒤, 정산월별로 담당자 수수료를 확정합니다.

## 스택

- **Next.js 16** (App Router, TypeScript, Turbopack)
- **Tailwind CSS 4**
- **Supabase** (Postgres + Auth + RLS)
- **SheetJS (xlsx)** — 엑셀 파싱
- 배포: **Vercel**

## 기능

### 관리자
- `/admin/categories` — prefix 기반 수수료율 (P→프로그램, M·H·S→상품)
- `/admin/reps` — 담당자 등록 / 역할·활성 관리
- `/admin/upload` — 매출현황.xlsx 업로드 → 파싱 → 미리보기 → 확정
- `/admin/sales` — 매출 한 건씩(거래 단위 그룹핑) 수금 체크
- `/admin/settlements` — 정산 처리 + 이력 + 취소
- `/admin/reports` — 정산월별 담당자 수수료 합계

### 담당자
- `/me/settlements` — 본인 월별 정산 + 세부 매출

## 핵심 정책

- **재업로드**: 같은 매출월의 미수금/미정산 행만 삭제 후 재insert (수금·정산 완료 행은 보존)
- **수수료율 변경**: 미정산 매출에 즉시 반영 (DB 트리거). 정산 확정 시점에 `commission_rate_snapshot` 박제
- **정산 취소**: 관리자만, `audit_logs`에 before JSON 기록
- **거래 단위**: 같은 고객 + 같은 마감일자는 1건의 거래로 묶여 표시. 수금 토글은 거래 단위
- **수수료 베이스**: 공급가(VAT 제외) × `commission_rate`
- **담당자 매칭**: 엑셀 `담당자` 컬럼 = `profiles.name`

## 로컬 개발

```bash
npm install
cp .env.local.example .env.local  # 값 채우기
npm run dev
```

`.env.local` 필요 변수:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_xxx
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
```

## 배포

Vercel에 GitHub 저장소를 import한 후, 위 3개 환경변수를 Project Settings → Environment Variables에 등록.

배포 후 Supabase Dashboard → Authentication → URL Configuration에 배포된 도메인을 Site URL / Redirect URLs로 추가.

## DB 마이그레이션

`supabase/migrations` 폴더에 마이그레이션이 누적되지만, 이 프로젝트는 Supabase MCP / Dashboard에서 직접 SQL을 적용했음. 핵심 테이블: `profiles`, `commission_categories`, `upload_batches`, `sales`, `settlements`, `audit_logs`.
