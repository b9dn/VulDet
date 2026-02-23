void isCorrect(Car **c) {
    if ((*c)->power <= 200) {
        *c = NULL;
    }
}

void read(Car *c) {
    printf("power: %d\n", c->power)
}


int check (Car *c) {
    isCorrect(&c);
    read(filtered);
}