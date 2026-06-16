-- Setzt offene Bestellungen ab 13:15 (Europe/Berlin) auf "nicht abgeholt".
-- Diese Migration ist idempotent: Der Job wird bei erneutem Ausfuehren neu gesetzt.

create extension if not exists pg_cron;

create or replace function public.setze_nicht_abgeholt_1315()
returns void
language plpgsql
security definer
as $$
declare
    berlin_now timestamp := timezone('Europe/Berlin', now());
    heute_iso text := to_char(berlin_now::date, 'YYYY-MM-DD');
    heute_de text := to_char(berlin_now::date, 'DD.MM.YYYY');
    betroffene_zeilen integer := 0;
    aktualisierte_freie integer := 0;
begin
    -- Nur werktags und nur im 13:15-Fenster ausfuehren.
    if extract(isodow from berlin_now) between 1 and 5
        and berlin_now::time >= time '13:15'
        and berlin_now::time < time '13:30' then
        update "Bestellungen"
        set status = 'nicht abgeholt'
        where status = 'bestellt'
          and (
              bestell_datum::text = heute_iso
              or bestell_datum::text = heute_de
          );

        get diagnostics betroffene_zeilen = row_count;

        if betroffene_zeilen > 0 then
            update "FreieEssen"
            set anzahl = coalesce(anzahl, 0) + betroffene_zeilen
            where datum = berlin_now::date;

            get diagnostics aktualisierte_freie = row_count;

            if aktualisierte_freie = 0 then
                insert into "FreieEssen" (datum, anzahl)
                values (berlin_now::date, betroffene_zeilen);
            end if;
        end if;
    end if;
end;
$$;

do $job$
begin
    if exists (
        select 1
        from cron.job
        where jobname = 'bestellungen-1315-nicht-abgeholt'
    ) then
        perform cron.unschedule('bestellungen-1315-nicht-abgeholt');
    end if;

    perform cron.schedule(
        'bestellungen-1315-nicht-abgeholt',
        '*/5 * * * 1-5',
        $$select public.setze_nicht_abgeholt_1315();$$
    );
end
$job$;
