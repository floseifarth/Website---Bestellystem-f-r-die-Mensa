-- Admin-Testhelfer fuer sofortigen Test OHNE Zeitfenster.
-- Nur in Test/Staging ausfuehren.

create or replace function public.setze_nicht_abgeholt_heute_ohne_zeitfenster()
returns integer
language plpgsql
security definer
as $$
declare
    berlin_now timestamp := timezone('Europe/Berlin', now());
    heute_iso text := to_char(berlin_now::date, 'YYYY-MM-DD');
    heute_de text := to_char(berlin_now::date, 'DD.MM.YYYY');
    betroffene_zeilen integer := 0;
begin
    update "Bestellungen"
    set status = 'nicht abgeholt'
    where status = 'bestellt'
      and (
                    bestell_datum::text = heute_iso
                    or bestell_datum::text = heute_de
      );

    get diagnostics betroffene_zeilen = row_count;

    if betroffene_zeilen > 0 then
        insert into "FreieEssen" (datum, anzahl)
        values (berlin_now::date, betroffene_zeilen);
    end if;

    return betroffene_zeilen;
end;
$$;

-- Vorher/Nachher-Pruefung
with vorher as (
    select status, count(*) as anzahl
    from "Bestellungen"
    where bestell_datum::text in (
        to_char(timezone('Europe/Berlin', now())::date, 'YYYY-MM-DD'),
        to_char(timezone('Europe/Berlin', now())::date, 'DD.MM.YYYY')
    )
    group by status
)
select * from vorher order by status;

select public.setze_nicht_abgeholt_heute_ohne_zeitfenster() as aktualisierte_zeilen;

with nachher as (
    select status, count(*) as anzahl
    from "Bestellungen"
    where bestell_datum::text in (
        to_char(timezone('Europe/Berlin', now())::date, 'YYYY-MM-DD'),
        to_char(timezone('Europe/Berlin', now())::date, 'DD.MM.YYYY')
    )
    group by status
)
select * from nachher order by status;

-- Optional: Funktion nach Test wieder entfernen
-- drop function if exists public.setze_nicht_abgeholt_heute_ohne_zeitfenster();
