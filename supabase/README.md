# Supabase 설정

DB 스키마는 `migrations/` 의 SQL 파일로 관리합니다. 번호 순서대로 한 번씩 실행하세요. 모든 파일은 다시 실행해도 안전합니다(idempotent).

## 0001_init.sql 실행하기

1. https://supabase.com/dashboard/project/uankwfwwhdirrklqacqe/sql/new 를 엽니다 (**SQL Editor → New query**).
2. `supabase/migrations/0001_init.sql` 내용을 **전부** 복사해 붙여 넣습니다.
3. 오른쪽 아래 **Run** 을 누릅니다. `Success. No rows returned` 가 나오면 끝입니다.
   - "destructive operation" 경고가 뜨면 `drop trigger/policy if exists` 때문이니 **Run this query** 로 진행하세요.

## 확인하기

SQL Editor 에서 아래를 실행합니다.

```sql
-- 1) 테이블 3개 + RLS 켜짐 (rowsecurity = true 가 3줄)
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('profiles', 'projects', 'documents');

-- 2) 정책 목록 (profiles 3개, projects 4개, documents 4개)
select tablename, policyname, cmd from pg_policies where schemaname = 'public' order by 1, 2;

-- 3) 계정 삭제 함수 존재
select proname, prosecdef from pg_proc where proname = 'delete_my_account';

-- 4) 이미 Google 로 로그인했던 계정이 있다면 프로필이 생겼는지
select id, nickname, avatar_url from public.profiles;
```

**Table Editor** 에서 `profiles`, `projects`, `documents` 옆에 `RLS enabled` 표시가 보이면 정상입니다.

## 참고

- 앱은 `profiles`, `documents` 를 사용합니다. `projects` 는 다음 단계 UI 를 위해 미리 만든 테이블입니다.
- 문서는 지금은 **본인만** 읽고 쓸 수 있습니다. 링크·전체 공개는 이후 마이그레이션에서 추가합니다.
- 계정 설정의 "계정 삭제" 는 `delete_my_account()` 를 호출해 `auth.users` 행을 지우고, 프로필·프로젝트·문서가 함께 삭제됩니다.
