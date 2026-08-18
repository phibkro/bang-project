import bang/account_entity
import gleam/dynamic
import gleam/erlang/process
import gleam/io

pub fn main() {
  let capability = account_entity.debit_account()
  let name = process.new_name("bang_m017_account_1")
  let assert Ok(account) = account_entity.start_supervised(name, 10)
  let started = account_entity.balance(account)
  let assert 10 = started
  io.println("PASS started account-1 at balance 10")

  let first_before = account_entity.balance(account)
  let first = account_entity.withdraw(account, capability, 4, "withdraw-1")
  let assert account_entity.Succeeded(
    entity_id: "account-1",
    message_id: "withdraw-1",
    message_type: "Withdraw",
    state: account_entity.AccountState(balance: first_after),
  ) = first
  let assert 10 = first_before
  let assert 6 = first_after
  io.println("PASS withdraw-1 returned Succeeded and owned state 10 -> 6")

  let second_before = account_entity.balance(account)
  let second = account_entity.withdraw(account, capability, 2, "withdraw-2")
  let assert account_entity.Succeeded(
    entity_id: "account-1",
    message_id: "withdraw-2",
    message_type: "Withdraw",
    state: account_entity.AccountState(balance: second_after),
  ) = second
  let assert 6 = second_before
  let assert 4 = second_after
  io.println("PASS withdraw-2 returned Succeeded and owned state 6 -> 4")

  let third_before = account_entity.balance(account)
  let third = account_entity.withdraw(account, capability, 9, "withdraw-3")
  let assert account_entity.TypedFailure(
    entity_id: "account-1",
    message_id: "withdraw-3",
    message_type: "Withdraw",
    failure_id: "WithdrawalRejected",
    state: account_entity.AccountState(balance: third_after),
  ) = third
  let assert 4 = third_before
  let assert 4 = third_after
  io.println(
    "PASS withdraw-3 returned WithdrawalRejected and preserved balance 4",
  )

  let invalid_before = account_entity.balance(account)
  let invalid =
    account_entity.dispatch_external(account, dynamic.string("not-a-withdraw"))
  let assert Error(_) = invalid
  let invalid_after = account_entity.balance(account)
  let assert 4 = invalid_before
  let assert 4 = invalid_after
  io.println("PASS invalid external Dynamic rejected before typed dispatch")

  let assert Ok(old_pid) = account_entity.account_pid(account)
  account_entity.force_failure(account)
  let old_terminated = wait_until_dead(old_pid, 100)
  let assert True = old_terminated
  io.println("PASS controlled abnormal failure terminated the old actor")

  let assert Ok(replacement) = wait_for_replacement(account, 100)
  let assert Ok(replacement_pid) = account_entity.account_pid(replacement)
  let replacement_observed = account_entity.balance(replacement) == 10
  let identity_changed = old_pid != replacement_pid
  let replacement_alive = process.is_alive(replacement_pid)
  let assert True = replacement_observed
  let assert True = identity_changed
  let assert True = replacement_alive
  io.println("PASS supervisor restarted a different live actor with balance 10")

  account_entity.stop(replacement)
  let supervisor_stopped = wait_for_supervisor_stop(replacement, 100)
  let assert True = supervisor_stopped
  io.println(
    "PASS normal stop triggered clean significant-child supervisor shutdown",
  )

  io.println(
    "BANG_M017_RESULT|entity=account-1|started=10|withdraw-1=succeeded:4:10:6|withdraw-2=succeeded:2:6:4|withdraw-3=typed-failure:WithdrawalRejected:9:4:4|invalid=unknown-message:before-dispatch:4:4|old-terminated=true|replacement-observed=true|identity-changed=true|replacement-alive=true|restart-balance=10|supervisor-stopped=true",
  )
}

fn wait_until_dead(pid: process.Pid, attempts: Int) -> Bool {
  case process.is_alive(pid) {
    False -> True
    True ->
      case attempts {
        0 -> False
        _ -> {
          process.sleep(10)
          wait_until_dead(pid, attempts - 1)
        }
      }
  }
}

fn wait_for_replacement(
  account: account_entity.Account,
  attempts: Int,
) -> Result(account_entity.Account, Nil) {
  case account_entity.lookup(account) {
    Ok(replacement) -> Ok(replacement)
    Error(_) ->
      case attempts {
        0 -> Error(Nil)
        _ -> {
          process.sleep(10)
          wait_for_replacement(account, attempts - 1)
        }
      }
  }
}

fn wait_for_supervisor_stop(
  account: account_entity.Account,
  attempts: Int,
) -> Bool {
  case account_entity.supervisor_alive(account) {
    False -> True
    True ->
      case attempts {
        0 -> False
        _ -> {
          process.sleep(10)
          wait_for_supervisor_stop(account, attempts - 1)
        }
      }
  }
}
