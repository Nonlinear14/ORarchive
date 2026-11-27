-- 롤꾸코드 문서 종류 추가 (2026-11-27)
-- documents.type 에 'roll20code' 를 허용한다. 기존 행은 바뀌지 않는다.
alter table public.documents drop constraint if exists documents_type_check;
alter table public.documents
  add constraint documents_type_check check (type in ('handout', 'log', 'character', 'roll20code'));
