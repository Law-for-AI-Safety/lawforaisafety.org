import { configure } from "@testing-library/react";

/**
 * A component test with a database waits on a real route handler and Postgres, which can take
 * longer than Testing Library's one-second default for `findBy` and `waitFor` on a busy
 * machine. A test that gives up early also leaves its request running into the next test.
 * This waits as long as the project's test timeout allows instead.
 */
configure({ asyncUtilTimeout: 25_000 });
