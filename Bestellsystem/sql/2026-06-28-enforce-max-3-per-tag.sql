-- Erzwingt serverseitig maximal 3 aktive Bestellungen pro Person und Tag.
-- Die Frontend-Pruefung bleibt bestehen, aber diese Absicherung verhindert
-- auch Doppelbestellungen aus zwei Tabs oder bei veralteten UI-Zustaenden.

create or replace function public.enforce_max_3_bestellungen_pro_tag()
returns trigger
language plpgsql
security definer
as $$
declare
    aktuelle_anzahl integer;
    ziel_datum text;
begin
    if new.status in ('archiviert', 'storniert') then
        return new;
    end if;

    ziel_datum := coalesce(new.bestell_datum::text, '');
    if ziel_datum = '' or new.auth_user_id is null then
        return new;
    end if;

        if tg_op = 'INSERT' then
                select count(*)
                into aktuelle_anzahl
                from "Bestellungen"
                where auth_user_id = new.auth_user_id
                    and bestell_datum::text = ziel_datum
                    and status not in ('archiviert', 'storniert');
        else
                select count(*)
                into aktuelle_anzahl
                from "Bestellungen"
                where auth_user_id = new.auth_user_id
                    and bestell_datum::text = ziel_datum
                    and status not in ('archiviert', 'storniert')
                    and id <> old.id;
        end if;

    if aktuelle_anzahl >= 3 then
        raise exception 'Maximal 3 Gerichte pro Tag und Person erlaubt.';
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_max_3_bestellungen_pro_tag on "Bestellungen";

create trigger trg_enforce_max_3_bestellungen_pro_tag
before insert or update of auth_user_id, bestell_datum, status
on "Bestellungen"
for each row
execute function public.enforce_max_3_bestellungen_pro_tag();