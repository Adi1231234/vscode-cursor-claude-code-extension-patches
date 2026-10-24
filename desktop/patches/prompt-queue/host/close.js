    /* What engines.js needs of a queue: take down what it drew when its
       conversation leaves the screen, and look again when it comes back. */
    return { detach: detachUi, pass: schedulePass };
};
