export default {
    transform: {
        '^.+\\.(t|j)s$': '@swc/jest',
    },
    testEnvironment: 'node',
    // Allow longer timeouts for worker tests
    testTimeout: 3000,
};
