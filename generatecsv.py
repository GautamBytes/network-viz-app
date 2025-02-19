import random

# Generate a larger network with 100 nodes and 300 edges
def generate_test_network():
    nodes = [f"Node_{i}" for i in range(100)]
    edges = []
    
    # Generate random edges
    for _ in range(300):
        source = random.choice(nodes)
        target = random.choice(nodes)
        # Avoid self-loops
        while target == source:
            target = random.choice(nodes)
        edges.append((source, target))
    
    # Write to CSV
    with open('test.csv', 'w') as f:
        f.write('source,target\n')
        for edge in edges:
            f.write(f'{edge[0]},{edge[1]}\n')

generate_test_network()