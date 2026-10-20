-- Applied live 20 Oct 2026. The wrong-network trigger also tags orders whose number matches no Ghana
-- network at all (failure_reason 'preflight_unrecognised_number_prefix'), so the customer can enter the
-- correct number on Track order instead of the order sitting in failed delivery.
create or replace function phase1.orders_flag_wrong_network()
 returns trigger language plpgsql as $function$
declare v_entered text; v_wanted text;
begin
  if new.status = 'failed_needs_review' and new.payment_status = 'succeeded'
     and (new.failure_reason like 'preflight_number_prefix_is_%' or new.failure_reason = 'preflight_unrecognised_number_prefix')
     and (old.status is distinct from new.status or old.failure_reason is distinct from new.failure_reason) then
    select n.name into v_wanted from phase1.networks n where n.id = new.network_id;
    new.admin_resolution_status := 'wrong_network';
    if new.failure_reason = 'preflight_unrecognised_number_prefix' then
      new.admin_resolution_reason := format('The number %s is not a Ghana mobile number on any network. Waiting for the customer to enter the correct %s number.', new.recipient_phone, coalesce(v_wanted,''));
    else
      v_entered := coalesce(phase1.network_for_prefix(new.recipient_phone), 'another network');
      new.admin_resolution_reason := format('The number %s is on %s, but this bundle is for %s. Waiting for the customer to enter the correct %s number.', new.recipient_phone, v_entered, coalesce(v_wanted,'the selected network'), coalesce(v_wanted,''));
    end if;
    new.admin_resolution_updated_at := now();
  end if;
  return new;
end $function$;
