import unittest
from types import SimpleNamespace
from unittest.mock import patch

import browser_predicate_support as helper


class Session:
    def __init__(self, results):
        self.results = iter(results)
        self.calls = []
        self.detached = False

    def send(self, method, params):
        self.calls.append((method, params))
        value = next(self.results)
        if isinstance(value, Exception):
            raise value
        return value

    def detach(self):
        self.detached = True


class PredicateTests(unittest.TestCase):
    def page(self, session):
        page = SimpleNamespace()
        page.context = SimpleNamespace(new_cdp_session=lambda target: session if target is page else None)
        return page

    def test_poll_retains_expression_and_disallows_nested_unsafe_eval(self):
        predicate = 'window.ORDER_RESEARCH_APP?.snapshot().route.screen==="q1"'
        session = Session([{'result': {'value': False}}, {'result': {'value': True}}])
        with patch.object(helper.time, 'sleep'):
            helper.wait_for_expression(self.page(session), predicate)
        self.assertEqual(len(session.calls), 2)
        for method, params in session.calls:
            self.assertEqual(method, 'Runtime.evaluate')
            self.assertEqual(params['expression'], f'Boolean({predicate})')
            self.assertIs(params['returnByValue'], True)
            self.assertIs(params['allowUnsafeEvalBlockedByCSP'], False)
            self.assertGreater(params['timeout'], 0)
            self.assertLessEqual(params['timeout'], 30000)
        self.assertTrue(session.detached)

    def test_false_predicate_keeps_timeout_and_releases_session(self):
        clock = [0.0]
        session = Session([{'result': {'value': False}}] * 3)
        with patch.object(helper.time, 'monotonic', side_effect=lambda: clock[0]), \
             patch.object(helper.time, 'sleep', side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)):
            with self.assertRaisesRegex(TimeoutError, 'within 10ms'):
                helper.wait_for_expression(self.page(session), 'false', timeout=10)
        self.assertAlmostEqual(clock[0], 0.010)
        self.assertTrue(session.detached)

    def test_late_true_result_cannot_extend_the_timeout(self):
        clock = [0.0]
        session = Session([{'result': {'value': True}}])
        original = session.send

        def delayed_result(method, params):
            clock[0] = 0.020
            return original(method, params)

        session.send = delayed_result
        with patch.object(helper.time, 'monotonic', side_effect=lambda: clock[0]):
            with self.assertRaisesRegex(TimeoutError, 'within 10ms'):
                helper.wait_for_expression(self.page(session), 'true', timeout=10)
        self.assertEqual(session.calls[0][1]['timeout'], 10)
        self.assertTrue(session.detached)

    def test_page_exception_is_not_hidden_as_a_wait(self):
        session = Session([{'exceptionDetails': {'exception': {'description': 'ReferenceError: missing app'}}}])
        with self.assertRaisesRegex(AssertionError, 'ReferenceError: missing app'):
            helper.wait_for_expression(self.page(session), 'missingApp.state')
        self.assertEqual(len(session.calls), 1)
        self.assertTrue(session.detached)

    def test_transport_failure_still_fails_and_releases_session(self):
        session = Session([RuntimeError('CDP connection closed')])
        with self.assertRaisesRegex(RuntimeError, 'CDP connection closed'):
            helper.wait_for_expression(self.page(session), 'true')
        self.assertTrue(session.detached)


if __name__ == '__main__':
    unittest.main()
