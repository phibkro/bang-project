#[path = "../../../../generated/rust/balance.rs"]
mod generated_balance;

use generated_balance::{Balance, BalanceError};

fn main() {
    let accepted = match Balance::new(0) {
        Ok(value) => value,
        Err(_) => panic!("expected zero to be accepted"),
    };
    assert_eq!(accepted.get(), 0);

    let rejected: BalanceError = match Balance::new(-1) {
        Ok(_) => panic!("expected negative one to be rejected"),
        Err(error) => error,
    };
    assert_eq!(rejected.rejected, -1);

    println!("accepted=0");
    println!("rejected=-1");
}
