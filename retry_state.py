"""A failed add profile may have the startup default source, but no login yet."""
def is_incomplete_account(account):
    return bool(account and not account.get('busy')
                and not account.get('email') and account.get('source','') in ('','login')
                and account.get('login_ok') != 1 and not account.get('sessionid'))
