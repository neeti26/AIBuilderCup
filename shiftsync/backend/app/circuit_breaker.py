"""
Circuit breaker for Gemini AI API calls.
Prevents cascading failures when the Gemini service is down or rate-limited.
"""
import asyncio
import time
import structlog
from enum import Enum
from typing import Callable, Optional, Any
from dataclasses import dataclass, field

logger = structlog.get_logger()


class CircuitState(str, Enum):
    CLOSED = "closed"       # Normal operation
    OPEN = "open"           # Failing — reject calls immediately
    HALF_OPEN = "half_open" # Testing — allow limited calls


@dataclass
class CircuitBreakerStats:
    failures: int = 0
    successes: int = 0
    last_failure_time: Optional[float] = None
    state_changes: int = 0


class CircuitBreaker:
    """
    Circuit breaker with exponential backoff.
    
    States:
    - CLOSED: requests pass through. After N failures, trip to OPEN.
    - OPEN: requests fail fast. After timeout, move to HALF_OPEN.
    - HALF_OPEN: allow 1 trial request. If success, close. If fail, reopen.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout: float = 30.0,
        half_open_max_calls: int = 1,
        name: str = "default",
    ):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.half_open_max_calls = half_open_max_calls
        self.name = name

        self._state = CircuitState.CLOSED
        self._stats = CircuitBreakerStats()
        self._half_open_calls = 0
        self._lock = asyncio.Lock()

    @property
    def state(self) -> CircuitState:
        return self._state

    async def call(self, func: Callable, *args, **kwargs) -> Any:
        """Execute func through the circuit breaker."""
        async with self._lock:
            await self._evaluate_state()

            if self._state == CircuitState.OPEN:
                raise CircuitBreakerOpenError(
                    f"Circuit breaker '{self.name}' is OPEN. "
                    f"Retry after {self._retry_after():.0f}s."
                )

            if self._state == CircuitState.HALF_OPEN:
                if self._half_open_calls >= self.half_open_max_calls:
                    raise CircuitBreakerOpenError(
                        f"Circuit breaker '{self.name}' is HALF_OPEN — at capacity."
                    )
                self._half_open_calls += 1

        try:
            result = await func(*args, **kwargs)
        except Exception as exc:
            await self._record_failure()
            raise exc
        else:
            await self._record_success()
            return result

    async def _evaluate_state(self) -> None:
        """Transition state based on time and failures."""
        now = time.monotonic()

        if self._state == CircuitState.OPEN:
            if now - (self._stats.last_failure_time or 0) >= self.recovery_timeout:
                await self._transition(CircuitState.HALF_OPEN)

    async def _record_success(self) -> None:
        async with self._lock:
            self._stats.successes += 1
            if self._state == CircuitState.HALF_OPEN:
                await self._transition(CircuitState.CLOSED)
                self._half_open_calls = 0
            else:
                self._stats.failures = max(0, self._stats.failures - 1)

    async def _record_failure(self) -> None:
        async with self._lock:
            self._stats.failures += 1
            self._stats.last_failure_time = time.monotonic()

            if self._state == CircuitState.HALF_OPEN:
                await self._transition(CircuitState.OPEN)
                self._half_open_calls = 0
            elif self._state == CircuitState.CLOSED:
                if self._stats.failures >= self.failure_threshold:
                    await self._transition(CircuitState.OPEN)

    async def _transition(self, new_state: CircuitState) -> None:
        if self._state != new_state:
            self._state = new_state
            self._stats.state_changes += 1
            logger.warning(
                "circuit_breaker_state_changed",
                breaker=self.name,
                from_state=self._state.value if self._state else "unknown",
                to_state=new_state.value,
                failures=self._stats.failures,
            )

    def _retry_after(self) -> float:
        if self._stats.last_failure_time is None:
            return 0.0
        elapsed = time.monotonic() - self._stats.last_failure_time
        return max(0.0, self.recovery_timeout - elapsed)

    def get_stats(self) -> dict:
        return {
            "name": self.name,
            "state": self._state.value,
            "failures": self._stats.failures,
            "successes": self._stats.successes,
            "state_changes": self._stats.state_changes,
            "retry_after": self._retry_after(),
        }


class CircuitBreakerOpenError(Exception):
    """Raised when circuit breaker is OPEN and rejects calls."""
    pass


# ─── Global circuit breakers ───────────────────────────────────────────────────
gemini_circuit_breaker = CircuitBreaker(
    failure_threshold=5,
    recovery_timeout=30.0,
    name="gemini-ai",
)
