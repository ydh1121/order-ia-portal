"""Read-only Chromium predicates without a page-owned string-eval poll loop."""
import time


def wait_for_expression(page, expression, *, timeout=30000):
    """Retain the predicate and timeout while evaluating through the debugger.

    Playwright 1.56's wait_for_function evaluates non-function expressions again
    from its page rAF callback. That nested eval violates this app's strict CSP.
    Runtime.evaluate compiles the same read-only expression at the debugger
    boundary for each poll; unsafe eval inside the page remains disallowed.
    """
    deadline = time.monotonic() + timeout / 1000
    session = page.context.new_cdp_session(page)
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f'Predicate did not become true within {timeout}ms: {expression}')
            result = session.send('Runtime.evaluate', {
                'expression': f'Boolean({expression})',
                'returnByValue': True,
                'allowUnsafeEvalBlockedByCSP': False,
                'timeout': remaining * 1000,
            })
            if result.get('exceptionDetails'):
                details = result['exceptionDetails']
                message = details.get('exception', {}).get('description') or details.get('text')
                raise AssertionError(f'Browser predicate failed: {message}')
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f'Predicate did not become true within {timeout}ms: {expression}')
            if result.get('result', {}).get('value') is True:
                return
            time.sleep(min(0.016, remaining))
    finally:
        session.detach()
