-- [1단계] 인증이 완료되면 자동으로 profiles 테이블을 생성해주는 함수 (avatar_url 포함)
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $func$
begin
  insert into public.profiles (id, email, avatar_url, tokens_balance)
  values (
    new.id, 
    new.email, 
    new.raw_user_meta_data->>'avatar_url',
    1000
  );
  return new;
end;
$func$;

-- [2단계] 새 회원이 auth.users에 추가될 때마다 위 함수를 실행하게 하는 방아쇠(Trigger)
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- [3단계] updated_at 자동 갱신을 위한 함수
create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $func$
begin
  new.updated_at = now();
  return new;
end;
$func$;

-- [4단계] profiles 테이블이 업데이트될 때 updated_at을 갱신하는 방아쇠(Trigger)
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at();
